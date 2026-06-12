import { useDeferredValue, useMemo, useState } from 'react'
import { Columns3, Copy, Download, Eye, FileMinus2, History, Mail, MessageCircle, MoreHorizontal, PackageOpen, Pencil, Printer, RotateCcw, Search, SlidersHorizontal, Trash2, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { InvoicePreview } from '../../components/invoice/InvoicePreview'
import { InvoiceForm } from './InvoiceForm'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { buildFiscalBuckets, calculateInvoice, invoiceModes } from '../../lib/taxEngine'
import { currency, formatDate } from '../../lib/formatters'

export function InvoiceList() {
  const toast = useToast()
  const invoices = useERPStore((state) => state.invoices)
  const creditNotes = useERPStore((state) => state.creditNotes)
  const customers = useERPStore((state) => state.customers)
  const company = useERPStore((state) => state.company)
  const duplicateInvoice = useERPStore((state) => state.duplicateInvoice)
  const voidInvoice = useERPStore((state) => state.voidInvoice)
  const createCreditNote = useERPStore((state) => state.createCreditNote)
  const deleteInvoice = useERPStore((state) => state.deleteInvoice)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')
  const [ncfType, setNcfType] = useState('all')
  const [selected, setSelected] = useState(null)
  const [pendingPrint, setPendingPrint] = useState('')
  const [pendingDownload, setPendingDownload] = useState('')
  const [editing, setEditing] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [crediting, setCrediting] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [productsView, setProductsView] = useState(null)
  const [historyView, setHistoryView] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditItems, setCreditItems] = useState([])
  const [creditPayment, setCreditPayment] = useState({ method: 'Efectivo', amount: '' })
  const [deleteReason, setDeleteReason] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [filters, setFilters] = useState(defaultAdvancedFilters)
  const deferredQuery = useDeferredValue(query)
  const sellers = useMemo(() => uniqueValues(invoices.map((invoice) => invoice.seller)), [invoices])
  const paymentMethods = useMemo(() => uniqueValues(invoices.flatMap((invoice) => (invoice.payments || []).map((payment) => payment.method).concat(invoice.paymentMethod || []))), [invoices])
  const searchResults = useMemo(() => {
    const queryText = normalize(deferredQuery)
    const matched = invoices.filter((invoice) => {
      const customer = customers.find((item) => item.id === invoice.customerId)
      const text = buildInvoiceSearchText(invoice, customer)
      const total = getInvoiceTotal(invoice)
      return (!queryText || text.includes(queryText) || queryText.split(/\s+/).every((part) => text.includes(part)))
        && (mode === 'all' || invoice.mode === mode)
        && (status === 'all' || invoice.status === status)
        && (ncfType === 'all' || invoice.ncfType === ncfType)
        && matchesQuickFilter(invoice, quickFilter)
        && matchesDateRange(invoice, filters.dateFrom, filters.dateTo)
        && matchesNumberMin(total, filters.minTotal)
        && matchesNumberMax(total, filters.maxTotal)
        && matchesExact(filters.seller, invoice.seller)
        && matchesPayment(invoice, filters.paymentMethod)
        && matchesLineSearch(invoice, filters.productQuery, ['name', 'sku', 'model', 'category'])
        && matchesLineSearch(invoice, filters.serialQuery, ['serial', 'serials'])
    })
    const sorted = sortInvoices(matched, filters.sortBy)
    const limit = parseResultLimit(filters.resultLimit)
    return {
      matched: sorted,
      visible: limit ? sorted.slice(0, limit) : sorted,
    }
  }, [customers, deferredQuery, filters, invoices, mode, ncfType, quickFilter, status])
  const filtered = searchResults.visible
  const buckets = buildFiscalBuckets(filtered)
  const totalMatched = searchResults.matched.length
  const hiddenByLimit = Math.max(totalMatched - filtered.length, 0)
  const creditPreviewTotals = useMemo(() => crediting ? calculateInvoice(creditItems.filter((item) => Number(item.quantity || 0) > 0), crediting.mode || invoiceModes.TAXED) : { total: 0, subtotal: 0, itbis: 0 }, [creditItems, crediting])
  const relatedCreditNotes = useMemo(() => crediting ? creditNotes.filter((note) => note.invoiceId === crediting.id && note.status !== 'voided') : [], [creditNotes, crediting])

  function setFilter(key, value) {
    setFilters((state) => ({ ...state, [key]: value }))
  }

  function resetFilters() {
    setQuery('')
    setMode('all')
    setStatus('all')
    setNcfType('all')
    setQuickFilter('all')
    setFilters(defaultAdvancedFilters)
  }

  function handleDuplicate(invoiceId) {
    try {
      const draft = duplicateInvoice(invoiceId)
      toast.success('Factura duplicada como borrador. Revise antes de emitir.')
      setEditing(draft)
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleVoid() {
    try {
      voidInvoice(voiding.id, voidReason)
      toast.success('Factura anulada correctamente.')
      setVoiding(null)
      setVoidReason('')
    } catch (error) {
      toast.error(error.message)
    }
  }

  function openCreditNote(invoice) {
    setCrediting(invoice)
    setCreditReason('')
    setCreditItems((invoice.items || []).map((item) => ({ ...item, quantity: Number(item.quantity || 0) })))
    setCreditPayment({ method: firstRefundMethod(invoice), amount: '' })
  }

  function handleCreditNote() {
    try {
      const amount = Number(creditPayment.amount || creditPreviewTotals.total || 0)
      const payments = amount > 0 ? [{ method: creditPayment.method, amount, reference: `NC ${crediting.number || crediting.ncf || ''}` }] : []
      const note = createCreditNote({ invoiceId: crediting.id, items: creditItems.filter((item) => Number(item.quantity || 0) > 0), reason: creditReason, payments })
      toast.success(`Nota de credito emitida: ${note.number}`)
      setCrediting(null)
      setCreditReason('')
      setCreditItems([])
      setCreditPayment({ method: 'Efectivo', amount: '' })
    } catch (error) {
      toast.error(error.message)
    }
  }

  function handleDelete() {
    try {
      deleteInvoice(deleting.id, deleteReason)
      toast.success('Factura eliminada correctamente.')
      setDeleting(null)
      setDeleteReason('')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const columns = [
    { header: '#', accessorKey: 'number' },
    { header: 'NCF', cell: ({ row }) => row.original.ncf || row.original.number },
    { header: 'Tipo', accessorKey: 'ncfType' },
    { header: 'Cliente', accessorKey: 'customerName' },
    { header: 'Fecha', cell: ({ row }) => formatDate(row.original.issuedAt || row.original.createdAt) },
    { header: 'Pago', cell: ({ row }) => paymentLabel(row.original) },
    { header: 'Vendedor', cell: ({ row }) => row.original.seller || '-' },
    { header: 'Items', cell: ({ row }) => (row.original.items || []).length },
    { header: 'Total', cell: ({ row }) => currency.format(row.original.totals?.total || 0) },
    { header: 'Pagado', cell: ({ row }) => currency.format(paidAmount(row.original)) },
    { header: 'Pendiente', cell: ({ row }) => currency.format(balanceDue(row.original)) },
    { header: 'Estado', cell: ({ row }) => <span className={statusClass(row.original.status)}>{statusLabel(row.original.status)}</span> },
    {
      header: 'Acciones',
      cell: ({ row }) => (
        <ActionDropdown
          invoice={row.original}
          customers={customers}
          company={company}
          onView={() => setSelected(row.original)}
          onDownload={() => { setPendingDownload(row.original.id); setSelected(row.original) }}
          onEdit={() => setEditing(row.original)}
          onDuplicate={() => handleDuplicate(row.original.id)}
          onPrint={() => { setPendingPrint(row.original.id); setSelected(row.original) }}
          onWhatsApp={() => openWhatsApp(row.original, customers, company)}
          onEmail={() => openEmail(row.original, customers, company)}
          onProducts={() => setProductsView(row.original)}
          onHistory={() => setHistoryView(row.original)}
          onCreditNote={() => openCreditNote(row.original)}
          onDelete={() => setDeleting(row.original)}
          onVoid={() => setVoiding(row.original)}
        />
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <section className="module-surface p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase" style={{ color: 'var(--color-nav)' }}>Facturacion</p>
            <h2 className="font-display text-3xl font-bold">Lista de facturas</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Emitidas, borradores, creditos y anulaciones sin eliminar historial fiscal.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Total label="Facturas mostradas" value={`${filtered.length} / ${totalMatched}`} />
          <Total label="Total con ITBIS" value={currency.format(buckets.taxed.total)} />
          <Total label="Total sin ITBIS" value={currency.format(buckets.noTax.total)} />
          <Total label="ITBIS total" value={currency.format(buckets.taxed.itbis + buckets.mixed.itbis)} />
        </div>
      </section>

      <section className="module-surface p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-3" style={{ borderColor: 'var(--line)', background: 'var(--bg-input)' }}>
            <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
            <input id="invoice-list-query" name="invoice-list-query" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35" placeholder="Buscar factura, cliente, NCF, RNC, telefono, producto, vendedor, pago, fecha o total" />
          </div>
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <button key={filter.id} type="button" onClick={() => setQuickFilter(filter.id)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${quickFilter === filter.id ? 'border-blue-400 bg-blue-500/15 text-blue-100' : 'border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>{filter.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-2" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.025)' }}>
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.7)' }}>
              <SlidersHorizontal size={15} />
              Busqueda avanzada
            </button>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold" style={{ color: 'rgba(255,255,255,.45)' }}>
              <span>{totalMatched} encontrada(s)</span>
              {hiddenByLimit ? <span>{hiddenByLimit} oculta(s) por limite</span> : null}
              <button type="button" onClick={resetFilters} className="rounded-lg border px-3 py-2 transition hover:bg-white/[0.07]" style={{ borderColor: 'var(--line)', color: 'rgba(255,255,255,.6)' }}>Limpiar</button>
            </div>
          </div>
          {advancedOpen ? (
            <div className="grid gap-3 rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'rgba(0,0,0,.15)' }}>
              <div className="toolbar-grid">
                <label><span className="label-dark">Desde</span><input id="invoice-list-date-from" name="invoice-list-date-from" type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} className="input-dark" /></label>
                <label><span className="label-dark">Hasta</span><input id="invoice-list-date-to" name="invoice-list-date-to" type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} className="input-dark" /></label>
                <label><span className="label-dark">Monto minimo</span><input id="invoice-list-min-total" name="invoice-list-min-total" type="number" min="0" value={filters.minTotal} onChange={(e) => setFilter('minTotal', e.target.value)} className="input-dark" placeholder="0.00" /></label>
                <label><span className="label-dark">Monto maximo</span><input id="invoice-list-max-total" name="invoice-list-max-total" type="number" min="0" value={filters.maxTotal} onChange={(e) => setFilter('maxTotal', e.target.value)} className="input-dark" placeholder="Sin limite" /></label>
              </div>
              <div className="toolbar-grid">
                <label><span className="label-dark">Vendedor</span><select id="invoice-list-seller" name="invoice-list-seller" value={filters.seller} onChange={(e) => setFilter('seller', e.target.value)} className="input-dark"><option value="all">Todos</option>{sellers.map((seller) => <option key={seller} value={seller}>{seller}</option>)}</select></label>
                <label><span className="label-dark">Metodo de pago</span><select id="invoice-list-payment-method" name="invoice-list-payment-method" value={filters.paymentMethod} onChange={(e) => setFilter('paymentMethod', e.target.value)} className="input-dark"><option value="all">Todos</option>{paymentMethods.map((payment) => <option key={payment} value={payment}>{payment}</option>)}</select></label>
                <label><span className="label-dark">Producto / SKU / modelo</span><input id="invoice-list-product-query" name="invoice-list-product-query" value={filters.productQuery} onChange={(e) => setFilter('productQuery', e.target.value)} className="input-dark" placeholder="Ej. iPhone, SKU, laptop" /></label>
                <label><span className="label-dark">Serial / IMEI</span><input id="invoice-list-serial-query" name="invoice-list-serial-query" value={filters.serialQuery} onChange={(e) => setFilter('serialQuery', e.target.value)} className="input-dark" placeholder="Serial, IMEI o parte" /></label>
              </div>
              <div className="toolbar-grid">
                <label><span className="label-dark">Mostrar maximo</span><select id="invoice-list-result-limit" name="invoice-list-result-limit" value={filters.resultLimit} onChange={(e) => setFilter('resultLimit', e.target.value)} className="input-dark"><option value="5">5 registros</option><option value="10">10 registros</option><option value="25">25 registros</option><option value="50">50 registros</option><option value="100">100 registros</option><option value="all">Todos</option></select></label>
                <label><span className="label-dark">Orden</span><select id="invoice-list-sort-by" name="invoice-list-sort-by" value={filters.sortBy} onChange={(e) => setFilter('sortBy', e.target.value)} className="input-dark"><option value="newest">Mas recientes</option><option value="oldest">Mas antiguas</option><option value="total_desc">Mayor monto</option><option value="total_asc">Menor monto</option><option value="customer">Cliente A-Z</option><option value="number">Numero / NCF</option></select></label>
              </div>
            </div>
          ) : null}
          <div className="toolbar-grid">
            <select id="invoice-list-mode" name="invoice-list-mode" value={mode} onChange={(e) => setMode(e.target.value)} className="input-dark"><option value="all">Modo: todos</option><option value={invoiceModes.TAXED}>Con ITBIS</option><option value={invoiceModes.NO_TAX}>Sin ITBIS</option><option value={invoiceModes.MIXED}>Mixta</option></select>
            <select id="invoice-list-status" name="invoice-list-status" value={status} onChange={(e) => setStatus(e.target.value)} className="input-dark"><option value="all">Estado: todos</option><option value="draft">Borrador</option><option value="paid">Pagada</option><option value="partial">Parcialmente pagada</option><option value="credit">Fiada / pendiente</option><option value="voided">Anulada</option></select>
            <select id="invoice-list-ncf-type" name="invoice-list-ncf-type" value={ncfType} onChange={(e) => setNcfType(e.target.value)} className="input-dark"><option value="all">NCF todos</option><option>B01</option><option>B02</option><option>B14</option><option>B15</option><option>E31</option><option>E32</option><option>NO_FISCAL</option></select>
          </div>
        </div>
        <div className="mt-4">
          <PremiumInvoiceTable data={filtered} columns={columns} />
        </div>
      </section>

      <Modal open={Boolean(selected)} onClose={() => { setSelected(null); setPendingPrint(''); setPendingDownload('') }} title="Detalle de factura" size="xl">
        {selected ? <InvoicePreview invoice={selected} company={company} customer={customers.find((customer) => customer.id === selected.customerId)} format="letter" autoPrint={pendingPrint === selected.id} onAutoPrintDone={() => setPendingPrint('')} autoDownload={pendingDownload === selected.id} onAutoDownloadDone={() => setPendingDownload('')} /> : null}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Editar factura" size="full">
        {editing ? <InvoiceForm initialInvoice={editing} onDone={() => setEditing(null)} /> : null}
      </Modal>

      <Modal open={Boolean(productsView)} onClose={() => setProductsView(null)} title={`Productos vendidos ${productsView?.number || ''}`} size="xl">
        {productsView ? <SoldProducts invoice={productsView} /> : null}
      </Modal>

      <Modal open={Boolean(historyView)} onClose={() => setHistoryView(null)} title={`Historial ${historyView?.number || ''}`} size="md">
        {historyView ? <InvoiceHistory invoice={historyView} /> : null}
      </Modal>

      <Modal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title={`Anular factura ${voiding?.number || ''}`}
        description="Las facturas fiscales no se eliminan; se anulan con motivo obligatorio."
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setVoiding(null)}>Cancelar</Button><Button variant="danger" icon={RotateCcw} onClick={handleVoid}>Confirmar anulacion</Button></div>}
      >
        <textarea id="invoice-list-void-reason" name="invoice-list-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="input-dark min-h-32 w-full" placeholder="Motivo obligatorio de anulacion, minimo 10 caracteres" />
      </Modal>

      <Modal
        open={Boolean(crediting)}
        onClose={() => setCrediting(null)}
        title={`Nota de credito ${crediting?.number || ''}`}
        description="Permite devolucion parcial o completa sin duplicar reversas."
        size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCrediting(null)}>Cancelar</Button><Button variant="danger" icon={FileMinus2} onClick={handleCreditNote}>Emitir nota</Button></div>}
      >
        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg p-3 md:grid-cols-4" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
            <Total label="Subtotal NC" value={currency.format(creditPreviewTotals.subtotal || 0)} />
            <Total label="ITBIS NC" value={currency.format(creditPreviewTotals.itbis || 0)} />
            <Total label="Total NC" value={currency.format(creditPreviewTotals.total || 0)} />
            <div className="flex items-end gap-2">
              <Button variant="ghost" className="w-full" onClick={() => setCreditItems((crediting?.items || []).map((item) => ({ ...item, quantity: Number(item.quantity || 0) })))}>Total</Button>
            </div>
          </div>
          <textarea id="invoice-list-credit-reason" name="invoice-list-credit-reason" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} className="input-dark min-h-24 w-full" placeholder="Motivo obligatorio, minimo 10 caracteres" />
          <div className="grid gap-3 rounded-lg p-3 md:grid-cols-3" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
            <label><span className="label-dark">Metodo reembolso</span><select id="invoice-list-credit-method" name="invoice-list-credit-method" value={creditPayment.method} onChange={(event) => setCreditPayment((state) => ({ ...state, method: event.target.value }))} className="input-dark"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Credito</option></select></label>
            <label><span className="label-dark">Monto reembolso</span><input id="invoice-list-credit-amount" name="invoice-list-credit-amount" type="number" min="0" max={creditPreviewTotals.total || 0} value={creditPayment.amount} onChange={(event) => setCreditPayment((state) => ({ ...state, amount: event.target.value }))} className="input-dark" placeholder={String(creditPreviewTotals.total || 0)} /></label>
            <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(0,0,0,.2)', color: 'rgba(255,255,255,.55)' }}>
              <p className="font-bold text-white">Impacto automatico</p>
              <p>Inventario, caja, CxC, reportes y contabilidad derivada se ajustan al emitir.</p>
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
            <p className="mb-2 text-xs font-extrabold uppercase" style={{ color: 'rgb(191, 219, 254)' }}>Historial relacionado</p>
            {relatedCreditNotes.length ? (
              <div className="space-y-2">
                {relatedCreditNotes.map((note) => (
                  <div key={note.id} className="grid gap-2 rounded-md p-2 text-sm md:grid-cols-[120px_1fr_120px_90px]" style={{ background: 'rgba(0,0,0,.2)' }}>
                    <span className="font-bold text-white">{note.number || note.ncf}</span>
                    <span style={{ color: 'rgba(255,255,255,.58)' }}>{note.reason || note.invoiceNumber}</span>
                    <span>{currency.format(note.totals?.total || 0)}</span>
                    <span style={{ color: 'rgba(255,255,255,.45)' }}>{formatDate(note.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>Sin notas emitidas para esta factura.</p>}
          </div>
          <div className="space-y-2">
            {creditItems.map((item, index) => (
              <div key={`${item.productId}-${index}`} className="grid gap-2 rounded-lg p-3 text-sm md:grid-cols-[1fr_120px]" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
                <div>
                  <p className="font-bold text-white">{item.name}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,.45)' }}>Vendido: {crediting?.items?.[index]?.quantity || item.quantity} | Seriales: {(item.serials || (item.serial ? [item.serial] : [])).join(', ') || '-'}</p>
                </div>
                <input id={"invoice-list-credit-item-qty-" + index} name={"invoice-list-credit-item-qty-" + index} type="number" min="0" max={crediting?.items?.[index]?.quantity || item.quantity} value={item.quantity} onChange={(event) => setCreditItems((items) => items.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Number(event.target.value) } : line))} className="input-dark" />
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Eliminar factura ${deleting?.number || ''}`}
        description="Solo se eliminan borradores o facturas no fiscales. Las fiscales emitidas deben anularse."
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="danger" icon={Trash2} onClick={handleDelete}>Eliminar</Button></div>}
      >
        {deleting?.status !== 'draft' ? <textarea id="invoice-list-delete-reason" name="invoice-list-delete-reason" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="input-dark min-h-32 w-full" placeholder="Motivo obligatorio de eliminacion, minimo 10 caracteres" /> : <p className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.62)' }}>Este borrador no afecta la numeracion fiscal y puede eliminarse directamente.</p>}
      </Modal>
    </div>
  )
}

function ActionDropdown({ invoice, customers, company, onView, onDownload, onEdit, onDuplicate, onPrint, onWhatsApp, onEmail, onProducts, onHistory, onCreditNote, onDelete, onVoid }) {
  const [open, setOpen] = useState(false)
  const groups = [
    { label: 'Visualizar', actions: [
      { icon: Eye, label: 'Ver detalle', onClick: onView },
      { icon: Download, label: 'Descargar PDF', onClick: onDownload },
      { icon: Printer, label: 'Imprimir', onClick: onPrint },
      { icon: PackageOpen, label: 'Productos vendidos', onClick: onProducts },
      { icon: History, label: 'Historial / logs', onClick: onHistory },
    ]},
    { label: 'Editar', actions: [
      { icon: Pencil, label: 'Editar', onClick: onEdit },
      { icon: Copy, label: 'Duplicar', onClick: onDuplicate },
      { icon: FileMinus2, label: 'Nota de credito', onClick: onCreditNote, disabled: invoice.status === 'draft' || invoice.status === 'voided' },
    ]},
    { label: 'Comunicar', actions: [
      { icon: MessageCircle, label: 'WhatsApp', onClick: onWhatsApp },
      { icon: Mail, label: 'Email', onClick: onEmail },
    ]},
    { label: 'Eliminar', actions: [
      { icon: Trash2, label: 'Eliminar borrador', onClick: onDelete, disabled: invoice.status !== 'draft' && invoice.ncfType !== 'NO_FISCAL' && Boolean(invoice.ncf) },
      { icon: XCircle, label: 'Anular', onClick: onVoid, disabled: invoice.status === 'draft' || invoice.status === 'voided' },
    ]},
  ]
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-md border p-2 transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.65)' }}>
        <MoreHorizontal size={15} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-52 rounded-lg border p-1 shadow-2xl" style={{ borderColor: 'var(--line)', background: 'var(--bg-surface)' }} onMouseLeave={() => setOpen(false)}>
          {groups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 ? <div className="my-1 border-t" style={{ borderColor: 'var(--line)' }} /> : null}
              <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{group.label}</p>
              {group.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => { action.onClick(); setOpen(false) }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
                  style={{ color: action.label === 'Anular' || action.label === 'Eliminar borrador' ? 'rgb(252, 165, 165)' : 'rgba(255,255,255,.78)' }}
                >
                  <action.icon size={14} /> {action.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Total({ label, value }) {
  return <div className="rounded-lg p-3" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}><p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>
}

function PremiumInvoiceTable({ data, columns }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState({ id: 'Fecha', dir: 'desc' })
  const [visible, setVisible] = useState(() => new Set(columns.map((column) => column.header)))
  const [columnsOpen, setColumnsOpen] = useState(false)
  const visibleColumns = columns.filter((column) => visible.has(column.header))
  const sorted = useMemo(() => sortTableData(data, sort), [data, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  function toggleColumn(header) {
    setVisible((current) => {
      const next = new Set(current)
      if (next.has(header) && next.size > 3) next.delete(header)
      else next.add(header)
      return next
    })
  }

  function sortBy(header) {
    setSort((current) => ({ id: header, dir: current.id === header && current.dir === 'asc' ? 'desc' : 'asc' }))
  }

  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line)', background: 'rgba(16,17,25,.7)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.035)' }}>
        <div className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.45)' }}>{sorted.length} resultado(s) organizados</div>
        <div className="relative flex flex-wrap gap-2">
          <select id="invoice-list-page-size" name="invoice-list-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="input-dark max-w-36">
            <option value="10">10 por pagina</option>
            <option value="25">25 por pagina</option>
            <option value="50">50 por pagina</option>
            <option value="100">100 por pagina</option>
          </select>
          <button type="button" onClick={() => setColumnsOpen((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.7)' }}><Columns3 size={15} /> Columnas</button>
          {columnsOpen ? (
            <div className="absolute right-0 top-12 z-20 grid min-w-56 gap-1 rounded-lg border p-2 shadow-2xl" style={{ borderColor: 'var(--line)', background: 'var(--bg-surface)' }}>
              {columns.map((column) => (
                <label key={column.header} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/[0.06]" style={{ color: 'rgba(255,255,255,.7)' }}>
                  <input id={"invoice-list-column-" + column.header} name={"invoice-list-column-" + column.header} type="checkbox" checked={visible.has(column.header)} onChange={() => toggleColumn(column.header)} />
                  {column.header}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="premium-scroll overflow-auto" style={{ maxHeight: '68vh' }}>
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="sticky top-0 z-10 text-xs uppercase shadow-lg" style={{ background: 'var(--bg-table-header)', color: 'rgba(255,255,255,.48)', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.header} className="px-4 py-3">
                  <button type="button" onClick={() => sortBy(column.header)} className="inline-flex items-center gap-1 font-bold hover:text-white">
                    {column.header}
                    <span style={{ color: 'rgba(255,255,255,.3)' }}>{sort.id === column.header ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {pageRows.length ? pageRows.map((invoice) => (
              <tr key={invoice.id} className="transition hover:bg-blue-500/[0.08]" style={{ background: 'rgba(255,255,255,.018)' }}>
                {visibleColumns.map((column) => (
                  <td key={`${invoice.id}-${column.header}`} className="px-4 py-3" style={{ color: 'rgba(255,255,255,.78)' }}>
                    {column.cell ? column.cell({ row: { original: invoice } }) : invoice[column.accessorKey] || '-'}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-sm" style={{ color: 'rgba(255,255,255,.45)' }}>No hay facturas para estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.025)', color: 'rgba(255,255,255,.55)' }}>
        <span>Pagina {safePage} de {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border px-3 py-2 font-bold hover:bg-white/[0.07]" style={{ borderColor: 'var(--line)' }}>Anterior</button>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border px-3 py-2 font-bold hover:bg-white/[0.07]" style={{ borderColor: 'var(--line)' }}>Siguiente</button>
        </div>
      </div>
    </div>
  )
}

function SoldProducts({ invoice }) {
  return (
    <div className="space-y-2">
      {(invoice.items || []).map((item, index) => (
        <div key={`${item.productId || item.name}-${index}`} className="grid gap-2 rounded-lg p-3 text-sm md:grid-cols-[1fr_80px_120px_120px]" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}>
          <div><p className="font-bold text-white">{item.name}</p><p style={{ color: 'rgba(255,255,255,.45)' }}>{item.sku || 'Sin SKU'} {item.model ? `· ${item.model}` : ''}</p><p className="text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>{(item.serials || (item.serial ? [item.serial] : [])).join(', ')}</p></div>
          <p>Cant. {item.quantity}</p>
          <p>{currency.format(item.price || 0)}</p>
          <p className="font-bold">{currency.format((Number(item.net || 0) + Number(item.tax || 0)) || (Number(item.price || 0) * Number(item.quantity || 0)))}</p>
        </div>
      ))}
    </div>
  )
}

function InvoiceHistory({ invoice }) {
  const auditLogs = useERPStore((state) => state.auditLogs)
  const invoiceLogs = auditLogs.filter((log) => JSON.stringify([log.before, log.after, log.action]).includes(invoice.id) || JSON.stringify([log.before, log.after]).includes(invoice.number))
  const entries = [
    ['Creada', invoice.createdAt || invoice.issueDate],
    ['Emitida', invoice.issuedAt],
    ['Actualizada', invoice.updatedAt],
    ['Version actual', invoice.version || 1],
    ['Estado', invoice.status],
    ['Vendedor', invoice.seller],
    ['Notas cliente', invoice.notesCustomer],
    ['Notas internas', invoice.notesInternal],
    ['Motivo anulacion', invoice.voidReason],
  ].filter(([, value]) => value)
  return (
    <div className="space-y-3">
      {entries.map(([label, value]) => <div key={label} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}><p className="text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,.4)' }}>{label}</p><p className="mt-1" style={{ color: 'rgba(255,255,255,.78)' }}>{String(value)}</p></div>)}
      {(invoice.versions || []).length ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase" style={{ color: 'rgb(191, 219, 254)' }}>Snapshots</p>
          <div className="space-y-2">{invoice.versions.map((version, index) => <div key={`${version.archivedAt}-${index}`} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}><p className="font-bold">Version {Number(invoice.version || 1) - index - 1}</p><p style={{ color: 'rgba(255,255,255,.45)' }}>{version.archivedBy} · {version.archivedAt}</p></div>)}</div>
        </div>
      ) : null}
      {invoiceLogs.length ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase" style={{ color: 'rgb(191, 219, 254)' }}>Auditoria</p>
          <div className="space-y-2">{invoiceLogs.slice(0, 8).map((log) => <div key={log.id} className="rounded-lg p-3 text-sm" style={{ border: '1px solid var(--line)', background: 'rgba(255,255,255,.035)' }}><p className="font-bold">{log.action}</p><p style={{ color: 'rgba(255,255,255,.45)' }}>{log.user} · {log.date}</p></div>)}</div>
        </div>
      ) : null}
    </div>
  )
}

function sortTableData(data, sort) {
  const getters = {
    '#': (invoice) => invoice.number || '',
    NCF: (invoice) => invoice.ncf || invoice.number || '',
    Tipo: (invoice) => invoice.ncfType || '',
    Cliente: (invoice) => invoice.customerName || '',
    Fecha: (invoice) => getInvoiceDate(invoice).getTime(),
    Pago: (invoice) => paymentLabel(invoice),
    Vendedor: (invoice) => invoice.seller || '',
    Items: (invoice) => (invoice.items || []).length,
    Total: (invoice) => getInvoiceTotal(invoice),
    Pagado: paidAmount,
    Pendiente: balanceDue,
    Estado: (invoice) => invoice.status || '',
  }
  const getter = getters[sort.id] || (() => '')
  return [...data].sort((a, b) => {
    const left = getter(a)
    const right = getter(b)
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))
    return sort.dir === 'asc' ? result : -result
  })
}

function paymentLabel(invoice) {
  const paid = paidAmount(invoice)
  const pending = balanceDue(invoice)
  const methods = (invoice.payments || []).filter((payment) => payment.method !== 'Credito').map((payment) => payment.method)
  if (pending > 0 && paid > 0) return `${methods.join(', ') || 'Abono'} + Credito`
  if (pending > 0) return 'Fiado / Credito'
  return methods.join(', ') || invoice.paymentMethod || '-'
}

function paidAmount(invoice) {
  if (invoice.paidAmount !== undefined) return Number(invoice.paidAmount || 0)
  return (invoice.payments || []).filter((payment) => payment.method !== 'Credito').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
}

function balanceDue(invoice) {
  if (invoice.balanceDue !== undefined) return Number(invoice.balanceDue || 0)
  const total = getInvoiceTotal(invoice)
  return Math.max(total - paidAmount(invoice), 0)
}

function statusLabel(status) {
  if (status === 'paid') return 'Pagada'
  if (status === 'partial') return 'Parcialmente pagada'
  if (status === 'credit') return 'Pendiente / fiada'
  if (status === 'draft') return 'Borrador'
  if (status === 'voided') return 'Anulada'
  return status || '-'
}

function statusClass(status) {
  if (status === 'voided') return 'text-red-300 line-through'
  if (status === 'partial') return 'text-amber-300'
  if (status === 'credit') return 'text-blue-200'
  return 'text-emerald-300'
}

function firstRefundMethod(invoice) {
  return invoice?.payments?.find((payment) => payment.method !== 'Credito')?.method || invoice?.paymentMethod || 'Efectivo'
}

function openWhatsApp(invoice, customers, company) {
  const customer = customers.find((item) => item.id === invoice.customerId)
  const phone = customer?.whatsapp || company.whatsapp
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Factura ${invoice.number} por ${currency.format(invoice.totals?.total || 0)} - ${company.name || 'Trifusion Technologies'}`)}`)
}

function openEmail(invoice, customers, company) {
  const customer = customers.find((item) => item.id === invoice.customerId)
  const subject = `Factura ${invoice.number || invoice.ncf || ''}`
  const body = `Hola ${customer?.name || invoice.customerName || ''},\n\nAdjuntamos la referencia de su factura ${invoice.number || invoice.ncf || ''} por ${currency.format(invoice.totals?.total || 0)}.\n\n${company.name || 'Trifusion Technologies'}`
  window.location.href = `mailto:${customer?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

const defaultAdvancedFilters = {
  dateFrom: '',
  dateTo: '',
  minTotal: '',
  maxTotal: '',
  seller: 'all',
  paymentMethod: 'all',
  productQuery: '',
  serialQuery: '',
  resultLimit: 'all',
  sortBy: 'newest',
}

const quickFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'credit', label: 'Credito' },
  { id: 'fiado', label: 'Fiado' },
  { id: 'partial', label: 'Parcial' },
  { id: 'paid', label: 'Pagadas' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'taxed', label: 'Con ITBIS' },
  { id: 'no_tax', label: 'Sin ITBIS' },
  { id: 'voided', label: 'Anuladas' },
]

function buildInvoiceSearchText(invoice, customer) {
  return normalize([
    invoice.number,
    invoice.ncf,
    invoice.ncfType,
    invoice.customerName,
    customer?.name,
    customer?.rnc,
    customer?.cedula,
    customer?.phone,
    customer?.whatsapp,
    invoice.issuedAt,
    invoice.createdAt,
    invoice.issueDate,
    invoice.status,
    invoice.mode,
    invoice.seller,
    invoice.paymentMethod,
    (invoice.payments || []).map((payment) => `${payment.method} ${payment.reference}`).join(' '),
    getInvoiceTotal(invoice),
    ...(invoice.items || []).flatMap((item) => [item.name, item.sku, item.model, item.category, item.serial, ...(item.serials || [])]),
  ].join(' '))
}

function getInvoiceDate(invoice) {
  const value = invoice.issuedAt || invoice.createdAt || invoice.issueDate
  const date = value ? new Date(value) : new Date(0)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function getInvoiceTotal(invoice) {
  return Number(invoice.totals?.total || invoice.total || 0)
}

function matchesDateRange(invoice, dateFrom, dateTo) {
  const date = getInvoiceDate(invoice)
  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`)
    if (date < from) return false
  }
  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`)
    if (date > to) return false
  }
  return true
}

function matchesNumberMin(value, minimum) {
  if (minimum === '') return true
  return Number(value) >= Number(minimum)
}

function matchesNumberMax(value, maximum) {
  if (maximum === '') return true
  return Number(value) <= Number(maximum)
}

function matchesExact(filterValue, value) {
  return filterValue === 'all' || normalize(value) === normalize(filterValue)
}

function matchesPayment(invoice, paymentMethod) {
  if (paymentMethod === 'all') return true
  return normalize(invoice.paymentMethod) === normalize(paymentMethod)
    || (invoice.payments || []).some((payment) => normalize(payment.method) === normalize(paymentMethod))
}

function matchesLineSearch(invoice, query, fields) {
  const text = normalize(query)
  if (!text) return true
  const haystack = normalize((invoice.items || []).flatMap((item) => fields.flatMap((field) => item[field] || [])).join(' '))
  return haystack.includes(text) || text.split(/\s+/).every((part) => haystack.includes(part))
}

function sortInvoices(invoices, sortBy) {
  return [...invoices].sort((a, b) => {
    if (sortBy === 'oldest') return getInvoiceDate(a) - getInvoiceDate(b)
    if (sortBy === 'total_desc') return getInvoiceTotal(b) - getInvoiceTotal(a)
    if (sortBy === 'total_asc') return getInvoiceTotal(a) - getInvoiceTotal(b)
    if (sortBy === 'customer') return String(a.customerName || '').localeCompare(String(b.customerName || ''))
    if (sortBy === 'number') return String(a.ncf || a.number || '').localeCompare(String(b.ncf || b.number || ''))
    return getInvoiceDate(b) - getInvoiceDate(a)
  })
}

function parseResultLimit(value) {
  if (value === 'all') return 0
  const limit = Number(value)
  return Number.isFinite(limit) && limit > 0 ? limit : 5
}

function uniqueValues(values) {
  return [...new Set(values.flat().filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b))
}

function matchesQuickFilter(invoice, filter) {
  const date = getInvoiceDate(invoice)
  const now = new Date()
  if (filter === 'today') return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
  if (filter === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    return date >= start
  }
  if (filter === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  if (filter === 'paid') return invoice.status === 'paid'
  if (filter === 'credit') return invoice.status === 'credit' && !(invoice.payments || []).some((payment) => payment.method === 'Credito' && payment.amount === invoice.totals?.total)
  if (filter === 'fiado') return invoice.status === 'credit' && (invoice.payments || []).filter((payment) => payment.method !== 'Credito').reduce((s, p) => s + Number(p.amount || 0), 0) === 0
  if (filter === 'partial') return invoice.status === 'partial'
  if (filter === 'overdue') {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const dueDate = invoice.dueDate || invoice.creditDueDate
    return dueDate && new Date(dueDate) < today && invoice.status !== 'paid' && invoice.status !== 'voided'
  }
  if (filter === 'taxed') return invoice.mode === invoiceModes.TAXED || invoice.mode === invoiceModes.MIXED
  if (filter === 'no_tax') return invoice.mode === invoiceModes.NO_TAX
  if (filter === 'voided') return invoice.status === 'voided'
  return true
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
