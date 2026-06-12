import { useState } from 'react'
import { Copy, ExternalLink, FileText, MessageCircle, Pencil, Plus, RefreshCcw, Search, Trash2, Printer, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { DataTable } from '../../components/ui/DataTable'
import { Modal } from '../../components/ui/Modal'
import { QuotePreview } from './QuotePreview'
import { useToast } from '../../hooks/useToast'
import { downloadQuotePdf, printQuotePdf } from '../../lib/quotePdf'
import { useConfirm } from '../../hooks/useConfirm'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useERPStore } from '../../store/useERPStore'
import { currency, formatDate } from '../../lib/formatters'

export function QuoteList() {
  const navigate = useNavigate()
  const toast = useToast()
  const { confirmState, ask, close } = useConfirm()
  const quotes = useERPStore((state) => state.quotes)
  const customers = useERPStore((state) => state.customers)
  const company = useERPStore((state) => state.company)
  const deleteQuote = useERPStore((state) => state.deleteQuote)
  const newQuoteVersion = useERPStore((state) => state.newQuoteVersion)
  const convertQuoteToInvoice = useERPStore((state) => state.convertQuoteToInvoice)
  const upsertQuote = useERPStore((state) => state.upsertQuote)
  const [viewing, setViewing] = useState(null)
  const [convert, setConvert] = useState(null)
  const [ncfType, setNcfType] = useState('B01')
  const [query, setQuery] = useState('')

  function action(fn, message) {
    try {
      const result = fn()
      toast.success(message)
      return result
    } catch (error) {
      toast.error(error.message)
      return null
    }
  }

  async function confirmDelete(quote) {
    const ok = await ask({
      title: `Eliminar cotizacion ${quote.number || ''}`,
      description: 'Esta accion elimina la cotizacion del listado.',
      body: `Se eliminara la cotizacion de ${quote.customerName || 'cliente'} por ${currency.format(quote.totals?.total || 0)}.`,
      danger: true,
    })
    if (ok) action(() => deleteQuote(quote.id), 'Cotizacion eliminada.')
  }

  const filteredQuotes = quotes.filter((quote) => `${quote.number || ''} ${quote.customerName || ''} ${quote.status || ''}`.toLowerCase().includes(query.toLowerCase()))

  const columns = [
    { header: '#', accessorKey: 'number', cell: ({ row }) => safeQuoteNumber(row.original.number), sortValueFn: (row) => safeQuoteNumber(row.number) },
    { header: 'Cliente', accessorKey: 'customerName' },
    { header: 'Fecha', cell: ({ row }) => formatDate(row.original.createdAt || row.original.date) },
    { header: 'Valida hasta', accessorKey: 'validUntil' },
    { header: 'Version', cell: ({ row }) => `v${row.original.version || 1}` },
    { header: 'Total', cell: ({ row }) => currency.format(row.original.totals?.total || 0) },
    { header: 'Estado', accessorKey: 'status' },
    {
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Icon title="Ver" icon={FileText} onClick={() => setViewing(row.original)} />
          <Icon title="Editar" icon={Pencil} onClick={() => navigate(`/cotizaciones/${row.original.id}/editar`)} />
          <Icon title="Nueva version" icon={RefreshCcw} onClick={() => navigate(`/cotizaciones/${action(() => newQuoteVersion(row.original.id), 'Nueva version creada.')?.id}/editar`)} />
          <Icon title="Convertir" icon={Copy} onClick={() => setConvert(row.original)} />
          <Icon title="Duplicar" icon={Copy} onClick={() => { const dup = action(() => upsertQuote({ ...row.original, id: undefined, number: undefined, status: 'Borrador', version: 1 }), 'Cotizacion duplicada.'); if (dup) navigate(`/cotizaciones/${dup.id}/editar`) }} />
          <Icon title="WhatsApp" icon={MessageCircle} onClick={() => openWhatsApp(row.original, customers, company)} />
          <Icon title="Descargar PDF" icon={Download} onClick={() => { setViewing(row.original); window.setTimeout(() => downloadQuotePdf(row.original), 500) }} />
          <Icon title="Imprimir" icon={Printer} onClick={() => { setViewing(row.original); window.setTimeout(() => printQuotePdf(), 500) }} />
          <Icon title="Eliminar" icon={Trash2} onClick={() => confirmDelete(row.original)} />
        </div>
      ),
    },
  ]

  return (
    <section className="module-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="font-display text-2xl font-bold">Cotizaciones</h2><p className="text-sm text-white/45">Versiones, WhatsApp y conversion a factura.</p></div>
        <div className="toolbar-grid w-full lg:max-w-2xl">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <Search size={16} className="text-white/35" />
            <input id="quote-search" name="quoteSearch" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar numero, cliente, estado" />
          </div>
          <Button icon={Plus} onClick={() => navigate('/cotizaciones/nueva')}>Nueva cotizacion</Button>
        </div>
      </div>
      <DataTable data={filteredQuotes} columns={columns} emptyText="No hay cotizaciones con esos filtros." />
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Vista de cotizacion" size="xl">
        {viewing ? <QuotePreview quote={viewing} company={company} customer={customers.find((customer) => customer.id === viewing.customerId)} /> : null}
      </Modal>
      <Modal open={Boolean(convert)} onClose={() => setConvert(null)} title="Convertir cotizacion a factura" size="sm" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConvert(null)}>Cancelar</Button><Button variant="success" onClick={() => action(() => { const draft = convertQuoteToInvoice(convert.id, ncfType); setConvert(null); return draft }, 'Cotizacion convertida a borrador de factura.')}>Convertir</Button></div>}>
        <label htmlFor="quote-convert-ncf"><span className="label-dark">Tipo NCF</span><select id="quote-convert-ncf" name="quoteConvertNcf" value={ncfType} onChange={(e) => setNcfType(e.target.value)} className="input-dark"><option>B01</option><option>B02</option><option>B14</option><option>B15</option><option>E31</option><option>E32</option><option>NO_FISCAL</option></select></label>
      </Modal>
      <ConfirmDialog state={confirmState} onClose={close} />
    </section>
  )
}

function Icon({ icon: IconSvg, onClick, title }) {
  return <button type="button" title={title} onClick={onClick} className="rounded-md border border-white/10 bg-white/[0.035] p-2 text-white/65 hover:bg-white/[0.08]"><IconSvg size={15} /></button>
}

function safeQuoteNumber(number) {
  if (!number) return ''
  if (typeof number === 'string') return number
  if (typeof number === 'object') return String(number.text || number.label || number.value || '')
  return String(number)
}

function openWhatsApp(quote, customers, company) {
  const customer = customers.find((item) => item.id === quote.customerId)
  const phone = customer?.whatsapp || company.whatsapp
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Estimado ${quote.customerName}, adjunto cotizacion No. ${quote.number} por un total de ${currency.format(quote.totals?.total || 0)}. Valida hasta ${quote.validUntil}.`)}`)
}
