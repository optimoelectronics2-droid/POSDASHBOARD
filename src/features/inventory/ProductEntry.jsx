import { useState } from 'react'
import { Eye, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Autocomplete } from '../../components/ui/Autocomplete'
import { DatePicker } from '../../components/ui/DatePicker'
import { DataTable } from '../../components/ui/DataTable'
import { useToast } from '../../hooks/useToast'
import { useERPStore } from '../../store/useERPStore'
import { todayIso } from '../../lib/dateTime'
import { currency, formatDate } from '../../lib/formatters'

const today = todayIso
const blankItem = () => ({ id: crypto.randomUUID(), productId: '', quantity: 1, cost: 0, serialText: '' })

export function ProductEntry() {
  const toast = useToast()
  const products = useERPStore((state) => state.products)
  const suppliers = useERPStore((state) => state.suppliers)
  const entries = useERPStore((state) => state.productEntries)
  const receiveProducts = useERPStore((state) => state.receiveProducts)
  const updateProductEntry = useERPStore((state) => state.updateProductEntry)
  const deleteProductEntry = useERPStore((state) => state.deleteProductEntry)
  const [detail, setDetail] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ type: 'Nueva mercancia', supplierId: 'no-supplier', date: today(), supplierInvoice: '', reference: '', items: [blankItem()] })
  const total = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.cost || 0), 0)

  function setLine(id, patch) {
    setForm((state) => ({ ...state, items: state.items.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  }

  function save() {
    try {
      const payload = {
        ...form,
        items: form.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          cost: Number(item.cost),
          serials: item.serialText.split(/[\n,]+/).map((serial) => serial.trim()).filter(Boolean),
        })),
      }
      if (editingId) {
        updateProductEntry(editingId, payload)
        toast.success('Entrada actualizada y stock recalculado correctamente.')
      } else {
        receiveProducts(payload)
        toast.success('Entrada registrada correctamente.')
      }
      setEditingId('')
      setForm({ type: 'Nueva mercancia', supplierId: 'no-supplier', date: today(), supplierInvoice: '', reference: '', items: [blankItem()] })
    } catch (error) {
      toast.error(error.message)
    }
  }

  function editEntry(entry) {
    setEditingId(entry.id)
    setForm({
      type: entry.type,
      supplierId: entry.supplierId,
      date: entry.date,
      supplierInvoice: entry.supplierInvoice,
      reference: entry.reference,
      items: entry.items.map((item) => ({
        id: crypto.randomUUID(),
        productId: item.productId,
        quantity: item.quantity,
        cost: item.cost,
        serialText: (item.serials || []).join('\n'),
      })),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function confirmDeleteEntry() {
    try {
      deleteProductEntry(deleteTarget.id, 'Eliminacion confirmada desde entradas')
      toast.success('Entrada eliminada y stock revertido.')
      setDeleteTarget(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">{editingId ? 'Editar entrada de mercancia' : 'Entrada de mercancia'}</h2>
          {editingId ? <Button variant="ghost" onClick={() => { setEditingId(''); setForm({ type: 'Nueva mercancia', supplierId: 'no-supplier', date: today(), supplierInvoice: '', reference: '', items: [blankItem()] }) }}>Cancelar edicion</Button> : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <label><span className="label-dark">Tipo de entrada</span><select id="entry-type" name="entry-type" value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))} className="input-dark"><option>Nueva mercancia</option><option>Devolucion proveedor</option><option>Ajuste positivo</option><option>Transferencia</option></select></label>
          <label><span className="label-dark">Proveedor</span><select id="entry-supplier" name="entry-supplier" value={form.supplierId} onChange={(e) => setForm((s) => ({ ...s, supplierId: e.target.value }))} className="input-dark">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <DatePicker label="Fecha" value={form.date} onChange={(date) => setForm((s) => ({ ...s, date }))} />
          <label><span className="label-dark">Factura proveedor</span><input id="entry-supplier-invoice" name="entry-supplier-invoice" value={form.supplierInvoice} onChange={(e) => setForm((s) => ({ ...s, supplierInvoice: e.target.value }))} className="input-dark" /></label>
          <label><span className="label-dark">Referencia / nota</span><input id="entry-reference" name="entry-reference" value={form.reference} onChange={(e) => setForm((s) => ({ ...s, reference: e.target.value }))} className="input-dark" /></label>
        </div>
        <div className="premium-scroll mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="text-left text-xs uppercase text-white/45"><tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th><th># Seriales</th><th></th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {form.items.map((item) => {
                const product = products.find((productItem) => productItem.id === item.productId)
                return (
                  <tr key={item.id} className="align-top">
                    <td className="w-80 py-3"><Autocomplete value={product} items={products.filter((p) => p.status !== 'Eliminado' && !p.deletedAt)} getMeta={(p) => `${p.sku} · Stock ${p.stock}`} getSearchText={(p) => `${p.name || ''} ${p.sku || ''} ${p.barcode || ''} ${p.model || ''} ${(p.serials || []).join(' ')}`} onSelect={(p) => setLine(item.id, { productId: p.id, cost: p.cost })} minQueryLength={1} startText="Busque el producto por nombre, codigo, modelo o serial" emptyText="Primero registre productos" /></td>
                    <td className="py-3"><input id="entry-qty" name="entry-qty" type="number" value={item.quantity} onChange={(e) => setLine(item.id, { quantity: Number(e.target.value) })} className="input-dark w-24" /></td>
                    <td className="py-3"><input id="entry-cost" name="entry-cost" type="number" value={item.cost} onChange={(e) => setLine(item.id, { cost: Number(e.target.value) })} className="input-dark w-32" /></td>
                    <td className="py-3 font-bold">{currency.format(Number(item.quantity || 0) * Number(item.cost || 0))}</td>
                    <td className="py-3">
                      {product?.requiresSerial ? <textarea id="entry-serials" name="entry-serials" value={item.serialText} onChange={(e) => setLine(item.id, { serialText: e.target.value })} placeholder="Uno por linea o coma" className="input-dark min-h-20 w-64" /> : <span className="text-white/35">No aplica</span>}
                    </td>
                    <td className="py-3"><button onClick={() => setForm((s) => ({ ...s, items: s.items.length === 1 ? [blankItem()] : s.items.filter((line) => line.id !== item.id) }))} className="text-red-300"><Trash2 size={16} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" icon={Plus} onClick={() => setForm((s) => ({ ...s, items: [...s.items, blankItem()] }))}>Agregar producto</Button>
          <div className="flex items-center gap-4"><p className="font-display text-2xl font-bold">{currency.format(total)}</p><Button icon={Save} onClick={save}>{editingId ? 'Actualizar entrada' : 'Guardar entrada'}</Button></div>
        </div>
      </section>
      <section className="panel rounded-lg p-5">
        <h3 className="mb-4 font-display text-xl font-bold">Historial de entradas</h3>
        <DataTable data={entries} columns={[
          { header: 'Fecha', cell: ({ row }) => formatDate(row.original.date) },
          { header: 'Proveedor', accessorKey: 'supplierName' },
          { header: 'Referencia', accessorKey: 'reference' },
          { header: 'Productos', cell: ({ row }) => row.original.items.map((item) => `${item.productName} x${item.quantity}`).join(', ') },
          { header: 'Total', cell: ({ row }) => currency.format(row.original.total) },
          { header: 'Acciones', cell: ({ row }) => (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" icon={Eye} onClick={() => setDetail(row.original)}>Ver</Button>
              <Button variant="ghost" icon={Pencil} onClick={() => editEntry(row.original)}>Editar</Button>
              <Button variant="danger" icon={Trash2} onClick={() => setDeleteTarget(row.original)}>Eliminar</Button>
            </div>
          ) },
        ]} />
      </section>
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Detalle de entrada" size="lg">
        {detail ? <pre className="premium-scroll max-h-[70vh] overflow-auto rounded-lg bg-black/30 p-4 text-sm text-white/70">{JSON.stringify(detail, null, 2)}</pre> : null}
      </Modal>
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar entrada"
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="danger" onClick={confirmDeleteEntry}>Eliminar y revertir stock</Button></div>}
      >
        <p className="text-sm text-white/70">Esta accion reversa el stock recibido en la entrada seleccionada y deja registro de auditoria. No se puede completar si algun serial ya fue vendido.</p>
      </Modal>
    </div>
  )
}
